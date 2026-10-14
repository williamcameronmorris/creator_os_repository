# Backend — Custom (OpenAI-compatible)

For users who want to use a third-party provider (Together, Fireworks, Replicate's OpenAI-compatible endpoint, self-hosted ComfyUI gateways, OpenRouter, etc.).

## Endpoint

```
POST <custom_base_url>/images/generations
Authorization: Bearer <custom_api_key>
Content-Type: application/json
```

Most providers follow the OpenAI Images API shape. If yours doesn't, the user should pick one of the other backends or extend this file with their schema.

Request body:
```json
{
  "model": "<custom_model from config>",
  "prompt": "<universal prompt from SKILL.md Step 5>",
  "size": "1024x1536",
  "n": 1
}
```

## Reference image handling

Try the OpenAI `images/edits` endpoint shape first:
```
POST <custom_base_url>/images/edits
```

If the provider returns 404 on `/edits`, the model probably doesn't accept image inputs through this API. Fall back to:

1. Describe the user's reference ads in plain language inside the prompt.
2. Mention the visual common denominators ("the user's saved references favor [X] composition, [Y] palette, [Z] type treatment").

## Run via Bash

```bash
curl -s "$CUSTOM_BASE_URL/images/generations" \
  -H "Authorization: Bearer $CUSTOM_API_KEY" \
  -H "Content-Type: application/json" \
  -d @request.json
```

Save the returned URL or base64 to `<output>/concept-<n>.png`.

## Rules

- One concept at a time.
- If the provider's response shape is non-standard, parse it from the JSON and adapt. Ask the user to share their provider's docs URL if you can't find the image field.
- If the user reports "this provider needs a different shape," update this file with their schema and re-run.
