
import math
from typing import List, Dict, Tuple, Optional

class PathFinder:
    def __init__(self):
        # Define the nodes (x, y coordinates in the SVG viewBox 0 0 1224 792)
        self.nodes = {
            "room_0020": (420, 190),  # User's start position
            "room_0010": (1020, 600), # Destination
            "h1": (420, 400),        # Hallway junction 1
            "h2": (700, 400),        # Hallway junction 2
            "h3": (1020, 400),       # Hallway junction 3
            "exit": (1100, 100),     # Emergency exit
        }
        
        # Define the edges (connections between nodes)
        self.edges = [
            ("room_0020", "h1"),
            ("h1", "h2"),
            ("h2", "h3"),
            ("h3", "room_0010"),
            ("h3", "exit"),
        ]
        
        self.graph = self._build_graph()

    def _build_graph(self) -> Dict[str, Dict[str, float]]:
        graph = {}
        for node in self.nodes:
            graph[node] = {}
        
        for u, v in self.edges:
            dist = self._calculate_distance(self.nodes[u], self.nodes[v])
            graph[u][v] = dist
            graph[v][u] = dist
            
        return graph

    def _calculate_distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def find_path(self, start_label: str, end_label: str) -> Optional[List[Dict[str, float]]]:
        """
        Find shortest path using Dijkstra's algorithm.
        Returns a list of coordinates.
        """
        # Map human-friendly labels to node keys
        start_node = f"room_{start_label}" if start_label.isdigit() else start_label
        end_node = f"room_{end_label}" if end_label.isdigit() else end_label
        
        if start_node not in self.nodes or end_node not in self.nodes:
            return None

        # Dijkstra implementation
        distances = {node: float('inf') for node in self.nodes}
        distances[start_node] = 0
        previous_nodes = {node: None for node in self.nodes}
        nodes_to_visit = list(self.nodes.keys())

        while nodes_to_visit:
            current_node = min(nodes_to_visit, key=lambda node: distances[node])
            nodes_to_visit.remove(current_node)

            if distances[current_node] == float('inf'):
                break

            for neighbor, weight in self.graph[current_node].items():
                new_distance = distances[current_node] + weight
                if new_distance < distances[neighbor]:
                    distances[neighbor] = new_distance
                    previous_nodes[neighbor] = current_node

        # Reconstruct path
        path = []
        current = end_node
        while current is not None:
            x, y = self.nodes[current]
            path.append({"x": x, "y": y, "label": current})
            current = previous_nodes[current]
            
        return path[::-1] # Reverse to get start -> end

_finder = None
def get_pathfinder():
    global _finder
    if _finder is None:
        _finder = PathFinder()
    return _finder
