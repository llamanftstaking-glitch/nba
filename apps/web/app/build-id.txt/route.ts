// The id of the build this server is running. Opaque; used only by components/version-watcher.tsx.
export const dynamic = "force-static";

export function GET() {
  return new Response(process.env.NEXT_PUBLIC_BUILD_ID ?? "", {
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
