package api

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestDocsEndpoints(t *testing.T) {
	testServer, _ := setupTestServer(t)
	defer testServer.Close()

	for _, path := range []string{"/docs", "/docs/"} {
		resp, err := http.Get(testServer.URL + path)
		if err != nil {
			t.Fatalf("failed to get %s: %v", path, err)
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			t.Fatalf("failed to read %s body: %v", path, readErr)
		}

		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected %s status 200, got %d", path, resp.StatusCode)
		}
		if contentType := resp.Header.Get("Content-Type"); !strings.Contains(contentType, "text/html") {
			t.Fatalf("expected %s content type text/html, got %q", path, contentType)
		}
		if !strings.Contains(string(body), "SwaggerUIBundle") {
			t.Fatalf("expected %s body to contain Swagger UI bootstrap", path)
		}
	}

	resp, err := http.Get(testServer.URL + "/openapi.yaml")
	if err != nil {
		t.Fatalf("failed to get openapi spec: %v", err)
	}

	body, readErr := io.ReadAll(resp.Body)
	resp.Body.Close()
	if readErr != nil {
		t.Fatalf("failed to read openapi spec body: %v", readErr)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected openapi status 200, got %d", resp.StatusCode)
	}
	if contentType := resp.Header.Get("Content-Type"); !strings.Contains(contentType, "application/yaml") {
		t.Fatalf("expected openapi content type application/yaml, got %q", contentType)
	}
	bodyText := string(body)
	if !strings.Contains(bodyText, "openapi: 3.0.3") {
		t.Fatalf("expected openapi version declaration")
	}
	if !strings.Contains(bodyText, "/api/v1/auth/login") {
		t.Fatalf("expected login path in openapi spec")
	}
}
