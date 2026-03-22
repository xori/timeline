import React from "react";

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300">404</h1>
        <p className="mt-2 text-gray-500">This page doesn't exist.</p>
        <p className="mt-1 text-sm text-gray-400">Check that your link is correct.</p>
      </div>
    </div>
  );
}
