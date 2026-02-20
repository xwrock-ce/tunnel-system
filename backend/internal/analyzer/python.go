package analyzer

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync/atomic"

	"tunnel-system/backend/internal/config"
)

type PythonAnalyzer struct {
	cfg       *config.Config
	script    string
	pythonBin string
	used      atomic.Bool
}

func NewPythonAnalyzer(cfg *config.Config) *PythonAnalyzer {
	return &PythonAnalyzer{
		cfg:       cfg,
		script:    filepath.Join(cfg.BackendDir, "ml_worker", "analyze.py"),
		pythonBin: cfg.PythonExec,
	}
}

func (p *PythonAnalyzer) Analyze(ctx context.Context, request Request, progress func(Progress)) (Result, error) {
	if _, err := os.Stat(p.script); err != nil {
		return Result{}, fmt.Errorf("python analyzer script not found: %s", p.script)
	}

	payload, err := json.Marshal(request)
	if err != nil {
		return Result{}, fmt.Errorf("marshal analysis request: %w", err)
	}

	cmd := exec.CommandContext(ctx, p.pythonBin, p.script)
	cmd.Dir = p.cfg.BackendDir

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return Result{}, fmt.Errorf("create stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return Result{}, fmt.Errorf("create stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return Result{}, fmt.Errorf("create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return Result{}, fmt.Errorf("start python analyzer: %w", err)
	}

	go func() {
		defer stdin.Close()
		_, _ = stdin.Write(payload)
		_, _ = stdin.Write([]byte("\n"))
	}()

	stderrBuf := &bytes.Buffer{}
	go func() {
		_, _ = io.Copy(stderrBuf, stderr)
	}()

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	var result Result
	resultReceived := false
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var envelope struct {
			Type string          `json:"type"`
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal([]byte(line), &envelope); err != nil {
			continue
		}

		switch envelope.Type {
		case "progress":
			if progress == nil {
				continue
			}
			var update struct {
				Stage    string `json:"stage"`
				Progress int    `json:"progress"`
				Message  string `json:"message"`
			}
			if err := json.Unmarshal(envelope.Data, &update); err == nil {
				progress(Progress{Stage: update.Stage, Progress: update.Progress, Message: update.Message})
			}
		case "result":
			if err := json.Unmarshal(envelope.Data, &result); err != nil {
				return Result{}, fmt.Errorf("decode analyzer result: %w", err)
			}
			resultReceived = true
		case "error":
			var message struct {
				Message string `json:"message"`
			}
			if err := json.Unmarshal(envelope.Data, &message); err == nil && message.Message != "" {
				return Result{}, errors.New(message.Message)
			}
		}
	}

	if scanErr := scanner.Err(); scanErr != nil {
		return Result{}, fmt.Errorf("read analyzer output: %w", scanErr)
	}

	if err := cmd.Wait(); err != nil {
		stderrText := strings.TrimSpace(stderrBuf.String())
		if stderrText == "" {
			return Result{}, fmt.Errorf("python analyzer failed: %w", err)
		}
		return Result{}, fmt.Errorf("python analyzer failed: %w: %s", err, stderrText)
	}

	if !resultReceived {
		stderrText := strings.TrimSpace(stderrBuf.String())
		if stderrText != "" {
			return Result{}, fmt.Errorf("python analyzer returned no result: %s", stderrText)
		}
		return Result{}, fmt.Errorf("python analyzer returned no result")
	}

	p.used.Store(true)
	return result, nil
}

func (p *PythonAnalyzer) ModelStatus() []ModelStatusItem {
	loaded := p.used.Load()

	statusFromFile := func(path string, onlineSpeed string) (string, *string, bool) {
		if _, err := os.Stat(path); err != nil {
			offline := "-"
			return "offline", &offline, false
		}
		if loaded {
			return "online", &onlineSpeed, true
		}
		standby := "-"
		return "standby", &standby, false
	}

	yoloPath := filepath.Join(p.cfg.ModelWeightsDir, p.cfg.YOLOWeights)
	yoloStatus, yoloSpeed, yoloLoaded := statusFromFile(yoloPath, "~12ms/frame")

	sam2Base := filepath.Join(p.cfg.ModelWeightsDir, p.cfg.SAM2BaseCheckpoint)
	sam2LoadedFlag := loaded
	sam2Status := "offline"
	sam2Speed := "-"
	if _, errBase := os.Stat(sam2Base); errBase == nil {
		sam2Status = "standby"
		if loaded {
			sam2Status = "online"
			sam2Speed = "~50ms/frame"
		} else {
			sam2LoadedFlag = false
		}
	}

	crackPath := filepath.Join(p.cfg.ModelWeightsDir, p.cfg.CrackYOLOWeights)
	crackStatus, crackSpeed, crackLoaded := statusFromFile(crackPath, "~8ms/frame")

	return []ModelStatusItem{
		{Name: "YOLOv11-L 掌子面检测", Version: "v2.4", Status: yoloStatus, Speed: yoloSpeed, Loaded: yoloLoaded},
		{Name: "SAM2 分割优化", Version: "v2.1", Status: sam2Status, Speed: &sam2Speed, Loaded: sam2LoadedFlag},
		{Name: "YOLOv11 裂缝检测", Version: "v1.0", Status: crackStatus, Speed: crackSpeed, Loaded: crackLoaded},
	}
}
