export default async function XHandoffReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const params = await searchParams;
  const failed = params.error === "1";

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-6">
      {failed ? (
        <p className="max-w-sm text-center text-[#f4f6f8]">
          Login did not finish. Go back and try again.
        </p>
      ) : (
        <div className="max-w-sm text-center text-[#f4f6f8]">
          <p>✓ Login complete</p>
          <p className="mt-2">
            You&apos;re now logged in on the browser you started in. You can close this and switch back to it.
          </p>
        </div>
      )}
    </div>
  );
}
