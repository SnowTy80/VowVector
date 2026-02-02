#!/usr/bin/env python3
"""Seed 1000 dummy nodes + random links into VowVector for performance testing."""

import argparse
import json
import random
import sys
import time
import urllib.request

API = "http://localhost:8000"

NODE_TYPES = ["Note", "Code", "AIInteraction", "Research", "Project", "Concept"]
RELATIONSHIP_TYPES = [
    "RELATES_TO", "IMPLEMENTS", "GENERATED", "SUPPORTS",
    "BELONGS_TO", "INSPIRED_BY",
]

TAGS_POOL = [
    "python", "javascript", "rust", "ai", "ml", "web", "api", "database",
    "graph", "vector", "embedding", "search", "visualization", "3d",
    "cyberpunk", "neo4j", "qdrant", "ollama", "fastapi", "docker",
    "gpu", "cuda", "networking", "security", "devops", "testing",
]

TITLE_PREFIXES = [
    "Understanding", "Implementing", "Exploring", "Debugging", "Optimizing",
    "Designing", "Refactoring", "Testing", "Deploying", "Analyzing",
    "Building", "Configuring", "Integrating", "Evaluating", "Documenting",
]

TITLE_SUBJECTS = [
    "Neural Networks", "Graph Databases", "Vector Search", "API Design",
    "Shader Programming", "Force Layouts", "Data Pipelines", "Auth Systems",
    "WebSocket Streams", "GPU Acceleration", "Container Orchestration",
    "Embedding Models", "Knowledge Graphs", "3D Visualization",
    "Cyberpunk UI", "Real-time Systems", "Event Sourcing", "CQRS Patterns",
    "Microservices", "Edge Computing", "Distributed Systems", "CI/CD",
    "Type Systems", "Functional Patterns", "State Machines", "Parsers",
]


def make_node(i):
    node_type = random.choice(NODE_TYPES)
    title = f"{random.choice(TITLE_PREFIXES)} {random.choice(TITLE_SUBJECTS)} #{i}"
    tags = random.sample(TAGS_POOL, k=random.randint(1, 4))
    content = (
        f"This is seed node {i} of type {node_type}. "
        f"It covers topics related to {', '.join(tags)}. "
        f"Generated for performance testing of VowVector 3D graph visualization."
    )
    return {
        "title": title,
        "content": content,
        "node_type": node_type,
        "tags": tags,
        "metadata": {"seed": True, "index": i},
    }


def post_json(path, data):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def main():
    parser = argparse.ArgumentParser(description="Seed VowVector with dummy data")
    parser.add_argument("-n", "--nodes", type=int, default=1000, help="Number of nodes")
    parser.add_argument("-l", "--links", type=int, default=1500, help="Number of links")
    parser.add_argument("--skip-embedding", action="store_true",
                        help="Use Tag type (no embedding) for speed")
    args = parser.parse_args()

    # Health check
    try:
        with urllib.request.urlopen(f"{API}/health") as r:
            print(f"Backend: {json.loads(r.read())['status']}")
    except Exception as e:
        print(f"Backend not reachable at {API}: {e}", file=sys.stderr)
        sys.exit(1)

    node_ids = []
    print(f"Creating {args.nodes} nodes...")
    t0 = time.time()

    for i in range(args.nodes):
        node_data = make_node(i)
        if args.skip_embedding:
            node_data["node_type"] = "Tag"  # Tag type skips Qdrant embedding

        try:
            result = post_json("/nodes", node_data)
            node_ids.append(result["id"])
        except Exception as e:
            print(f"  Failed node {i}: {e}")

        if (i + 1) % 100 == 0:
            elapsed = time.time() - t0
            print(f"  {i + 1}/{args.nodes} nodes ({elapsed:.1f}s)")

    elapsed = time.time() - t0
    print(f"Created {len(node_ids)} nodes in {elapsed:.1f}s")

    # Create random links
    num_links = min(args.links, len(node_ids) * 2)
    print(f"Creating {num_links} links...")
    t1 = time.time()
    created_links = 0

    for j in range(num_links):
        src, tgt = random.sample(node_ids, 2)
        link_data = {
            "target_id": tgt,
            "relationship": random.choice(RELATIONSHIP_TYPES),
            "properties": {},
        }
        try:
            post_json(f"/nodes/{src}/link", link_data)
            created_links += 1
        except Exception as e:
            pass  # Some may fail if relationship type invalid on label

        if (j + 1) % 200 == 0:
            elapsed = time.time() - t1
            print(f"  {j + 1}/{num_links} links ({elapsed:.1f}s)")

    elapsed = time.time() - t1
    print(f"Created {created_links} links in {elapsed:.1f}s")
    print(f"\nDone. Total: {len(node_ids)} nodes, {created_links} links")


if __name__ == "__main__":
    main()
