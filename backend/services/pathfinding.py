"""
Dynamic pathfinding — builds a navigation graph from the Gemini-powered
map analysis instead of hardcoded coordinates.

The graph nodes include room door positions and hallway waypoints so
that every computed path follows indoor corridors and never crosses walls.
"""

import math
from typing import List, Dict, Tuple, Optional, Any


class PathFinder:
    """
    Shortest-path finder over a navigation graph produced by MapAnalyzer.
    """

    def __init__(self):
        # node_id → (x, y)
        self.nodes: Dict[str, Tuple[float, float]] = {}
        # room_label → node_id   (e.g. "0020" → "room_0020")
        self.room_lookup: Dict[str, str] = {}
        # room_id → {"door_x", "door_y"}
        self.room_doors: Dict[str, Tuple[float, float]] = {}
        # adjacency list  node_id → {neighbour_id: distance}
        self.graph: Dict[str, Dict[str, float]] = {}
        self._loaded = False

    # ────────────────── Load from analysis ──────────────────

    def load_from_analysis(self, analysis: Dict[str, Any]) -> None:
        """
        Populate the graph from a map analysis dict
        (as returned by MapAnalyzer).
        """
        self.nodes.clear()
        self.room_lookup.clear()
        self.room_doors.clear()
        self.graph.clear()

        # 1. Register rooms — the walkable entry point is the *door*
        for room in analysis.get("rooms", []):
            rid = room["id"]                        # "room_0020"
            label = room.get("label", rid.replace("room_", ""))
            door_x = room.get("door_x", room["center_x"])
            door_y = room.get("door_y", room["center_y"])

            # The node we route to/from is the door position
            self.nodes[rid] = (door_x, door_y)
            self.room_doors[rid] = (door_x, door_y)
            self.room_lookup[label] = rid
            # Also register normalised variants so "20" and "0020" both work
            if label.isdigit():
                stripped = label.lstrip("0") or "0"
                padded = label.zfill(4)
                for variant in (stripped, padded, label):
                    self.room_lookup.setdefault(variant, rid)
            self.graph[rid] = {}

        # 2. Register hallway waypoints
        for hw in analysis.get("hallway_nodes", []):
            hid = hw["id"]
            self.nodes[hid] = (hw["x"], hw["y"])
            self.graph[hid] = {}

        # 3. Build edges from declared connections
        for conn in analysis.get("connections", []):
            u = conn["from"]
            v = conn["to"]
            if u in self.nodes and v in self.nodes:
                dist = self._dist(self.nodes[u], self.nodes[v])
                self.graph.setdefault(u, {})[v] = dist
                self.graph.setdefault(v, {})[u] = dist

        self._loaded = True
        n_rooms = len(self.room_lookup)
        n_halls = len(analysis.get("hallway_nodes", []))
        n_edges = len(analysis.get("connections", []))
        print(f"✅ Navigation graph: {n_rooms} rooms, {n_halls} hallway nodes, {n_edges} connections")

    # ────────────────── Pathfinding ──────────────────

    def find_path(
        self, start_label: str, end_label: str
    ) -> Optional[List[Dict[str, Any]]]:
        """
        Dijkstra shortest path between two room labels (e.g. "0020" → "0010").
        Returns a list of {x, y, label} waypoints or None.
        """
        start_node = self._resolve(start_label)
        end_node = self._resolve(end_label)

        if start_node is None:
            print(f"⚠️  Unknown start room: {start_label}")
            return None
        if end_node is None:
            print(f"⚠️  Unknown destination room: {end_label}")
            return None
        if start_node == end_node:
            x, y = self.nodes[start_node]
            return [{"x": x, "y": y, "label": start_node}]

        # Dijkstra
        INF = float("inf")
        dist = {n: INF for n in self.nodes}
        prev: Dict[str, Optional[str]] = {n: None for n in self.nodes}
        dist[start_node] = 0
        unvisited = set(self.nodes.keys())

        while unvisited:
            current = min(unvisited, key=lambda n: dist[n])
            if dist[current] == INF:
                break
            if current == end_node:
                break
            unvisited.remove(current)

            for neighbour, weight in self.graph.get(current, {}).items():
                if neighbour in unvisited:
                    alt = dist[current] + weight
                    if alt < dist[neighbour]:
                        dist[neighbour] = alt
                        prev[neighbour] = current

        # Reconstruct
        if dist[end_node] == INF:
            return None

        path_ids: List[str] = []
        cur: Optional[str] = end_node
        while cur is not None:
            path_ids.append(cur)
            cur = prev[cur]
        path_ids.reverse()

        return [
            {"x": self.nodes[nid][0], "y": self.nodes[nid][1], "label": nid}
            for nid in path_ids
        ]

    # ────────────────── Room listing ──────────────────

    def get_available_rooms(self) -> List[str]:
        """Return sorted list of known room labels."""
        return sorted(self.room_lookup.keys())

    # ────────────────── Internals ──────────────────

    def _resolve(self, label: str) -> Optional[str]:
        """Map a human label (e.g. '0020') to a node id.

        Tries several normalised forms so that '20', '0020', '020' all
        resolve to the same room regardless of how Gemini labelled it.
        """
        label = label.strip()

        # 1. Direct node id
        if label in self.nodes:
            return label

        # 2. room_XXXX format
        prefixed = f"room_{label}"
        if prefixed in self.nodes:
            return prefixed

        # 3. Exact lookup
        if label in self.room_lookup:
            return self.room_lookup[label]

        # 4. Normalised lookup — strip leading zeros then compare
        stripped = label.lstrip("0") or "0"
        for stored_label, node_id in self.room_lookup.items():
            if (stored_label.lstrip("0") or "0") == stripped:
                return node_id

        # 5. Try zero-padded variants (common 4-digit room numbers)
        if label.isdigit():
            for width in (4, 3, 2):
                padded = label.zfill(width)
                if padded in self.room_lookup:
                    return self.room_lookup[padded]
                prefixed_padded = f"room_{padded}"
                if prefixed_padded in self.nodes:
                    return prefixed_padded

        return None

    @staticmethod
    def _dist(a: Tuple[float, float], b: Tuple[float, float]) -> float:
        return math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)


# ── Singleton ──
_finder: Optional[PathFinder] = None


def get_pathfinder() -> PathFinder:
    global _finder
    if _finder is None:
        _finder = PathFinder()
    return _finder
