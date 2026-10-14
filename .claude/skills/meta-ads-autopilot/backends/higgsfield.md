# Backend — Higgsfield MCP

For each approved concept, call the Higgsfield image generation tool one at a time.

## Reference upload

For each image in `reference_ads_folder` (and the brand's product image):

1. Call `media_upload` with the file path.
2. Call `media_confirm` to register it.
3. Collect the returned media IDs.

## Generate

Call `generate_image` with:
- `model: "gpt_image_2"`
- `aspect_ratio: "4:5"` (closest to 1080×1350 IG feed)
- `quality: "high"`, `resolution: "2k"`
- `count: 1`
- Pass collected media IDs as `image_references` (or whatever the current MCP schema names the references field).
- Use the universal prompt template from `SKILL.md` Step 5.

## Rules

- One call at a time. Parallel Higgsfield calls time out.
- If the Higgsfield MCP isn't connected, tell the user to re-run setup and pick a different backend.
- Download each result to `<output>/concept-<n>.png`.
