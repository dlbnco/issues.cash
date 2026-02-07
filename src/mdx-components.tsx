import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ children }) => (
      <h1 className="text-3xl font-bold mb-4">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-2xl font-bold mt-8 mb-4">{children}</h2>
    ),
    p: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-4 space-y-2">{children}</ul>
    ),
    li: ({ children }) => <li>{children}</li>,
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    a: ({ href, children }) => (
      <a href={href} className="text-primary hover:underline">
        {children}
      </a>
    ),
    ...components,
  };
}
