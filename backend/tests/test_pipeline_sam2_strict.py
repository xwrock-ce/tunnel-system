import numpy as np
import pytest

from app.ml.pipeline import TunnelSegmentationPipeline


class _DummyTensor:
    def __init__(self, values):
        self._values = np.array(values, dtype=np.float32)

    def cpu(self):
        return self

    def numpy(self):
        return self._values


class _DummyBoxes:
    def __init__(self):
        self.conf = _DummyTensor([0.92])


class _DummyResult:
    def __init__(self):
        self.boxes = _DummyBoxes()


class _PromptEncoder:
    def __init__(self, mask_input_size):
        self.mask_input_size = mask_input_size


class _PredictorModel:
    def __init__(self, mask_input_size):
        self.sam_prompt_encoder = _PromptEncoder(mask_input_size)


class _CapturingPredictor:
    def __init__(self, mask_input_size=(128, 192), out_shape=(16, 16)):
        self.model = _PredictorModel(mask_input_size)
        self.out_shape = out_shape
        self.last_kwargs = None

    def predict(self, **kwargs):
        self.last_kwargs = kwargs
        h, w = self.out_shape
        masks = np.zeros((2, h, w), dtype=np.float32)
        masks[0, 1:3, 1:3] = 1.0
        masks[1, 4:10, 5:12] = 1.0
        scores = np.array([0.1, 0.95], dtype=np.float32)
        logits = np.zeros((2, 256, 256), dtype=np.float32)
        return masks, scores, logits


class PipelineUnderTest(TunnelSegmentationPipeline):
    @property
    def yolo_model(self):
        return self._yolo_model

    @property
    def sam2_predictor(self):
        return self._sam2_predictor


@pytest.fixture
def image_rgb() -> np.ndarray:
    return np.zeros((16, 16, 3), dtype=np.uint8)


@pytest.fixture
def pipeline() -> PipelineUnderTest:
    p = PipelineUnderTest(
        yolo_weights='unused.pt',
        sam2_config='unused.yaml',
        sam2_base_checkpoint='unused.pt',
    )
    p._yolo_model = lambda _img: [_DummyResult()]
    return p


def test_predict_uses_sam2_masks_in_strict_mode(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = object()

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 10, 10]],
            [np.ones((16, 16), dtype=bool)],
        ),
    )
    monkeypatch.setattr(
        PipelineUnderTest,
        '_refine_with_sam2',
        lambda self, mask, _box: (mask, True),
    )

    result = pipeline.predict(
        image_rgb,
        use_sam2_refinement=True,
        sam2_image_preloaded=True,
        require_sam2_output=True,
    )

    assert result['final_mask_source'] == 'sam2'
    assert result['sam2_refined_count'] == 1


def test_predict_raises_when_sam2_unavailable_in_strict_mode(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = None

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 10, 10]],
            [np.ones((16, 16), dtype=bool)],
        ),
    )

    with pytest.raises(RuntimeError, match='SAM2 strict mode enabled'):
        pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=True,
            require_sam2_output=True,
        )


def test_predict_raises_when_part_of_masks_fallback_to_yolo(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = object()

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 6, 6], [7, 7, 12, 12]],
            [
                np.ones((16, 16), dtype=bool),
                np.ones((16, 16), dtype=bool),
            ],
        ),
    )

    calls = {'count': 0}

    def _refine(self, mask, _box):
        calls['count'] += 1
        if calls['count'] == 1:
            return mask, True
        return mask, False

    monkeypatch.setattr(PipelineUnderTest, '_refine_with_sam2', _refine)

    with pytest.raises(RuntimeError, match='only 1/2 masks were refined by SAM2'):
        pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=True,
            require_sam2_output=True,
        )


def test_refine_with_sam2_uses_box_and_mask_prompts(pipeline):
    predictor = _CapturingPredictor(mask_input_size=(96, 128), out_shape=(16, 16))
    pipeline._sam2_predictor = predictor

    yolo_mask = np.ones((16, 16), dtype=bool)
    box = [2, 3, 12, 14]
    refined, used_sam2 = pipeline._refine_with_sam2(yolo_mask, box)

    assert used_sam2 is True
    assert predictor.last_kwargs is not None
    assert predictor.last_kwargs["multimask_output"] is True
    assert predictor.last_kwargs["mask_input"].shape == (1, 96, 128)
    assert predictor.last_kwargs["box"].shape == (1, 4)
    assert predictor.last_kwargs["box"].dtype == np.float32
    assert predictor.last_kwargs["point_coords"] is None
    assert predictor.last_kwargs["point_labels"] is None
    assert refined.dtype == np.bool_
    assert int(np.count_nonzero(refined)) == (10 - 4) * (12 - 5)


def test_predict_raises_when_yolo_returns_boxes_without_masks_in_strict_mode(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = object()

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 10, 10]],
            [],
        ),
    )

    with pytest.raises(RuntimeError, match='boxes without segmentation masks'):
        pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=True,
            require_sam2_output=True,
        )


def test_predict_raises_when_yolo_box_mask_prompts_mismatch_in_strict_mode(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = object()

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 6, 6], [7, 7, 12, 12]],
            [np.ones((16, 16), dtype=bool)],
        ),
    )

    with pytest.raises(RuntimeError, match='mismatched prompts'):
        pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=True,
            require_sam2_output=True,
        )


@pytest.mark.parametrize(
    "config_value,expected",
    [
        ("configs/sam2.1/sam2.1_hiera_b+.yaml", "configs/sam2.1/sam2.1_hiera_b+.yaml"),
        ("sam2_configs/sam2.1/sam2.1_hiera_b+.yaml", "configs/sam2.1/sam2.1_hiera_b+.yaml"),
        (
            "/home/wangxu/Pictures/tunnel-system/model_weights/sam2_configs/sam2.1/sam2.1_hiera_b+.yaml",
            "configs/sam2.1/sam2.1_hiera_b+.yaml",
        ),
        (
            "home/wangxu/Pictures/tunnel-system/model_weights/sam2_configs/sam2.1/sam2.1_hiera_b+.yaml",
            "configs/sam2.1/sam2.1_hiera_b+.yaml",
        ),
        (
            "/home/wangxu/Desktop/yolov11/sam2/sam2/configs/sam2.1/sam2.1_hiera_b+.yaml",
            "configs/sam2.1/sam2.1_hiera_b+.yaml",
        ),
    ],
)
def test_normalize_sam2_config_name(config_value, expected):
    assert PipelineUnderTest._normalize_sam2_config_name(config_value) == expected


def test_predict_strict_error_contains_sam2_init_root_cause(monkeypatch, pipeline, image_rgb):
    pipeline._sam2_predictor = None
    pipeline._sam2_init_error = "Cannot find primary config 'configs/sam2.1/sam2.1_hiera_b+.yaml'"

    monkeypatch.setattr(
        PipelineUnderTest,
        '_extract_yolo_outputs',
        lambda self, _results, _shape: (
            [[1, 1, 10, 10]],
            [np.ones((16, 16), dtype=bool)],
        ),
    )

    with pytest.raises(RuntimeError, match='Root cause: Cannot find primary config'):
        pipeline.predict(
            image_rgb,
            use_sam2_refinement=True,
            sam2_image_preloaded=True,
            require_sam2_output=True,
        )
