// Node type -> color mapping (cyberpunk palette)
export const NODE_COLORS = {
  Note:          '#00FFFF', // Cyan
  Code:          '#FF00FF', // Magenta
  AIInteraction: '#00FF00', // Neon Green
  Research:      '#FF0080', // Hot Pink
  Project:       '#FFD700', // Gold
  Concept:       '#8A2BE2', // Blue Violet
  Tag:           '#FF4500', // Orange Red
  Topic:         '#1E90FF', // Dodger Blue
};

export const DEFAULT_NODE_COLOR = '#AAAAAA';

export function getNodeColor(nodeType) {
  return NODE_COLORS[nodeType] || DEFAULT_NODE_COLOR;
}
