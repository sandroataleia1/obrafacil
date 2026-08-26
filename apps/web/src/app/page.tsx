import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ObraFácil — apps/web</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ambiente Next.js configurado e funcionando.
          </p>
          <ul className="list-inside list-disc text-sm text-zinc-600 dark:text-zinc-400">
            <li>App Router</li>
            <li>TypeScript (strict)</li>
            <li>Tailwind CSS</li>
            <li>shadcn/ui</li>
          </ul>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            API health check: {process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/health
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
