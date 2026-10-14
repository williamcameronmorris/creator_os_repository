# Backend — OpenAI Direct

For each approved concept, hit the OpenAI Images API one at a time.

## Endpoint

```
POST https://api.openai.com/v1/images/generations
Authorization: Bearer <openai_api_key>
Content-Type: application/json
```

Request body for text-only generation:
```json
{
  "model": "gpt-image-1",
  "prompt": "<universal prompt from SKILL.md Step 5>",
  "size": "1024x1536",
  "quality": "high",
  "n": 1
}
```

## Reference image handling

Use the **edits** endpoint instead when references are present:

```
POST https://api.openai.com/v1/images/edits
```

Multipart form fields:
- `model=gpt-image-1`
- `prompt=<universal prompt>`
- `image[]=<file>` for the brand product image
- `image[]=<file>` once per reference ad in `reference_ads_folder` (max ~10)
- `size=1024x1536`
- `quality=high`

## Run via Bash

```bash
curl -s https://api.openai.com/v1/images/edits \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F model=gpt-image-1 \
  -F "prompt=$PROMPT" \
  -F "image[]=@product.png" \
  -F "image[]=@ref1.png" \
  -F "image[]=@ref2.png" \
  -F size=1024x1536 \
  -F quality=high
```

Decode the `b64_json` field from the response and write to `<output>/concept-<n>.png`.

## Rules

- One concept at a time.
- If the user has zero reference ads, fall back to the `generations` endpoint (no images).
- If a request returns 401, tell the user the OpenAI key is invalid and to re-run setup.
- Watch for OpenAI's content policy: ads using real public figures or trademarked logos may be rejected. If a concept gets refused, regenerate with the offending element described more abstractly.
