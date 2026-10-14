# Backend — kie.ai

For each approved concept, hit the kie.ai image API one at a time.

## Endpoint

```
POST https://api.kie.ai/api/v1/playground/createTask
Authorization: Bearer <kie_api_key>
Content-Type: application/json
```

**Key lookup:** if config has `kie_api_key_env`, read the key from that environment variable (e.g. `$KIE_API_KEY`) instead of `kie_api_key`. If the variable is empty, stop image gen and tell the user to add it in the cloud environment settings. Never ask for the key in chat.

Request body shape (gpt-image-1 example):
```json
{
  "model": "<kie_model from config>",
  "input": {
    "prompt": "<universal prompt from SKILL.md Step 5>",
    "size": "1024x1536",
    "image": ["<base64 or URL of product image>", "<base64 or URL of each reference ad>"],
    "n": 1,
    "quality": "high"
  }
}
```

Then poll:
```
GET https://api.kie.ai/api/v1/playground/recordInfo?taskId=<id>
Authorization: Bearer <kie_api_key>
```

Until `status` is `success`. Download the `resultUrls[0]` to `<output>/concept-<n>.png`.

## Reference image handling

For each file in `reference_ads_folder`:
- If the model supports image inputs (gpt-image-1, nano-banana, flux-kontext): upload as base64 in the `image` array.
- If it's a text-only model (flux-pro, seedream): describe the references in plain language inside the prompt instead.

## Run via Bash

Use `curl` from Bash. Example:
```bash
curl -s https://api.kie.ai/api/v1/playground/createTask \
  -H "Authorization: Bearer $KIE_KEY" \
  -H "Content-Type: application/json" \
  -d @request.json
```

## Rules

- One concept at a time.
- If a request returns 401, tell the user the kie key is invalid and to re-run setup.
- If the model name in config returns "model not found," list available models from kie.ai docs and ask the user to pick one.
