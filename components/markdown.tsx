import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Elements styled with Tailwind, as its preflight resets headings, lists and the like.
const components: Components = {
  h1: (props) => <h2 className="mt-6 mb-2 text-xl font-semibold first:mt-0" {...props} />,
  h2: (props) => <h3 className="mt-5 mb-2 text-lg font-semibold first:mt-0" {...props} />,
  h3: (props) => <h4 className="mt-4 mb-2 font-semibold first:mt-0" {...props} />,
  h4: (props) => <h5 className="mt-4 mb-2 font-semibold first:mt-0" {...props} />,
  p: (props) => <p className="my-3 first:mt-0 last:mb-0" {...props} />,
  a: (props) => (
    <a className="text-primary underline underline-offset-4" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  ul: (props) => <ul className="my-3 list-disc pl-6 first:mt-0 last:mb-0" {...props} />,
  ol: (props) => <ol className="my-3 list-decimal pl-6 first:mt-0 last:mb-0" {...props} />,
  li: (props) => <li className="my-1" {...props} />,
  blockquote: (props) => <blockquote className="my-3 border-l-2 pl-4 text-muted-foreground" {...props} />,
  hr: (props) => <hr className="my-6" {...props} />,
  pre: (props) => <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 text-sm" {...props} />,
  code: (props) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-sm in-[pre]:bg-transparent in-[pre]:p-0" {...props} />,
  table: (props) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  th: (props) => <th className="border-b px-2 py-1 text-left font-medium" {...props} />,
  td: (props) => <td className="border-b px-2 py-1" {...props} />,
};

// Markdown (with GitHub extensions such as tables and task lists) rendered as HTML. Raw HTML in the
// text is not rendered.
export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-base break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
