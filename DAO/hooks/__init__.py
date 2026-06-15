"""DAO runtime hooks into Hermes agent execution."""

from DAO.hooks.tool_writeback import maybe_DAO_tool_writeback
from DAO.hooks.prompt_supervisor import (
    apply_DAO_supervisor_routing,
    maybe_publish_supervisor_route,
)
from DAO.hooks.worker_task import maybe_capture_worker_task, maybe_worker_preflight

__all__ = [
    "apply_DAO_supervisor_routing",
    "maybe_capture_worker_task",
    "maybe_DAO_tool_writeback",
    "maybe_publish_supervisor_route",
    "maybe_worker_preflight",
]
