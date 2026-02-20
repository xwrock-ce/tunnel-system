package ws

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Message struct {
	Type     string `json:"type"`
	Stage    string `json:"stage"`
	Progress int    `json:"progress"`
	Message  string `json:"message"`
}

type Hub struct {
	mu          sync.RWMutex
	connections map[uint]*websocket.Conn
}

func NewHub() *Hub {
	return &Hub{
		connections: make(map[uint]*websocket.Conn),
	}
}

func (h *Hub) Set(analysisID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if old, ok := h.connections[analysisID]; ok && old != conn {
		_ = old.Close()
	}
	h.connections[analysisID] = conn
}

func (h *Hub) Remove(analysisID uint, conn *websocket.Conn) {
	h.mu.Lock()
	defer h.mu.Unlock()

	current, ok := h.connections[analysisID]
	if !ok {
		return
	}
	if conn != nil && current != conn {
		return
	}
	delete(h.connections, analysisID)
}

func (h *Hub) Send(analysisID uint, msg Message) {
	h.mu.RLock()
	conn := h.connections[analysisID]
	h.mu.RUnlock()
	if conn == nil {
		return
	}

	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if err := conn.WriteJSON(msg); err != nil {
		h.Remove(analysisID, conn)
		_ = conn.Close()
	}
}
