#!/usr/bin/env python3
"""Smoke-test DAO WS ticket auth against /api/ws."""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

import websockets


def http_json(method: str, url: str, body: dict | None = None, token: str | None = None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


async def main() -> int:
    base = os.environ.get("DAO_API", "http://127.0.0.1:9119")
    login = http_json("POST", f"{base}/api/v1/auth/dev-login", {"email": "ws-smoke@example.com"})
    token = login["token"]
    spaces = http_json("GET", f"{base}/api/v1/spaces", token=token)
    if not spaces:
        space = http_json(
            "POST",
            f"{base}/api/v1/spaces",
            {"name": "WS Smoke", "slug": "ws-smoke"},
            token=token,
        )
        space_id = space["id"]
    else:
        space_id = spaces[0]["id"]

    ticket = http_json("POST", f"{base}/api/v1/spaces/{space_id}/ws/ticket", token=token)["ticket"]
    ws_base = base.replace("http://", "ws://").replace("https://", "wss://")
    uri = f"{ws_base}/api/ws?ticket={urllib.parse.quote(ticket, safe='')}"
    origin = base

    async with websockets.connect(uri, origin=origin) as ws:
        await ws.send(
            json.dumps(
                {
                    "jsonrpc": "2.0",
                    "id": "1",
                    "method": "session.create",
                    "params": {"close_on_disconnect": True},
                }
            )
        )
        session_id = None
        while session_id is None:
            msg = json.loads(await ws.recv())
            if msg.get("id") == "1":
                if "error" in msg:
                    print(json.dumps(msg, indent=2))
                    return 1
                session_id = msg["result"]["session_id"]
        print(json.dumps({"session_id": session_id}, indent=2))
    print("WS auth + session.create OK")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except urllib.error.HTTPError as exc:
        print(f"HTTP {exc.code}: {exc.read().decode()}", file=sys.stderr)
        raise SystemExit(1)
