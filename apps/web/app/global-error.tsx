"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body className="font-sans flex items-center justify-center min-h-screen">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Critical Error</h1>
          <p className="text-gray-600 mb-6">The application encountered a critical error and cannot recover.</p>
          <button
            onClick={reset}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
