# ChatGPT Work manual handoff

Use `scripts/chatgpt-work-handoff.py` to create a compact packet for a **manual** ChatGPT Work session. This lowers paid agent usage by moving suitable review, drafting, planning, and patch-proposal work out of the active Hermes/Codex session without inventing a provider integration.

The command reads only Git metadata from the selected repository. It does not inspect Hermes credentials, change provider/model configuration, contact OpenAI, or modify external accounts. Secret-like values in supplied text and Git status output are replaced with `[REDACTED]`; still review every packet before pasting it externally.

## Create and save a packet

Run from the Fieldstead repository:

```bash
python3 scripts/chatgpt-work-handoff.py \
  --task "Review the estimate preview accessibility and propose the smallest patch." \
  --repo . \
  --file app/estimate-preview.tsx \
  --file app/estimate-preview.test.tsx \
  --constraint "Do not change persistence or provider configuration." \
  --accept "Keyboard and screen-reader behavior is covered by tests." \
  --accept "Return exact edits or a unified diff." \
  --test "npm test -- app/estimate-preview.test.tsx" \
  --output .hermes-tmp/chatgpt-work-handoff.md
```

To print instead of saving, omit `--output`. To save and print, add `--stdout`.

## Workflow

1. Generate the packet and review it for private business/customer information.
2. Paste it into ChatGPT Work manually. Do not paste credentials or real customer data.
3. Ask ChatGPT Work to fill in the packet's **Return handoff to Hermes** section.
4. Paste that return section into Hermes. Hermes should inspect/apply the proposed edits locally, run the stated tests, and verify the repository before reporting completion.

ChatGPT Work is not an API provider in this workflow. The packet is a copy/paste boundary, and Hermes remains responsible for local execution and verification.
