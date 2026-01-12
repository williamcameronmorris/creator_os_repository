import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { image_url, caption, access_token } = await req.json();

    const containerResponse = await fetch(
      `https://graph.instagram.com/me/media?image_url=${encodeURIComponent(image_url)}&caption=${encodeURIComponent(caption)}&access_token=${access_token}`,
      { method: "POST" }
    );
    const containerData = await containerResponse.json();

    if (!containerData.id) {
      throw new Error("Failed to create media container");
    }

    const publishResponse = await fetch(
      `https://graph.instagram.com/me/media_publish?creation_id=${containerData.id}&access_token=${access_token}`,
      { method: "POST" }
    );
    const publishData = await publishResponse.json();

    return new Response(
      JSON.stringify({ id: publishData.id }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});