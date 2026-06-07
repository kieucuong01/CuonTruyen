# Agent Playbooks Index

Read these in order for the least-token onboarding path:

```text
AGENTS.md
docs/agent-playbooks/agent-token-map.md
docs/agent-playbooks/current-deployment.md
docs/agent-playbooks/frontend-map.md
docs/agent-playbooks/vercel-s3-publishing.md
```

## Files

| File | Use when |
| --- | --- |
| `agent-token-map.md` | A new AI agent needs to know which files to read and which large folders to avoid. |
| `current-deployment.md` | Anyone needs live Vercel/S3/local deployment state. |
| `comic-reader.md` | Product architecture, crawler rules, reader rules, and core API contracts. |
| `frontend-map.md` | Frontend/admin/reader edit locations and mobile safety checks. |
| `vercel-s3-publishing.md` | Publishing local crawl output to Vietnix S3 and Vercel. |
| `production-readiness.md` | Public safety and production checklist. |

## Rule For Future Docs

Keep playbooks short and task-focused. Prefer adding a small targeted file over growing one giant document.
