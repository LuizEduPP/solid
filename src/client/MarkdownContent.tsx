import { Tooltip } from "@mantine/core";
import type { Root } from "mdast";
import { findAndReplace } from "mdast-util-find-and-replace";
import ReactMarkdown from "react-markdown";
import rehypeExternalLinks from "rehype-external-links";
import remarkGfm from "remark-gfm";
import type { Plugin } from "unified";

import FaviconImg from "./FaviconImg";
import { hostnameFromUrl } from "../shared";
import "github-markdown-css/github-markdown-dark.css";

const BRACKET_URLS =
  /\[(https?:\/\/[^\]\s,]+(?:,\s*https?:\/\/[^\]\s,]+)*)\]/g;

const remarkSolid: Plugin<[], Root> = () => (tree) => {
  findAndReplace(tree, [
    [/\$\\rightarrow\$/g, "→"],
    [/\$\\leftrightarrow\$/g, "↔"],
    [/\$\\leftarrow\$/g, "←"],
    [
      BRACKET_URLS,
      (match) =>
        match[1]
          .split(/,\s*/)
          .map((raw: string) => {
            const url = raw.trim();
            return `[${hostnameFromUrl(url)}](${url})`;
          })
          .join(" "),
    ],
  ]);
};

interface MarkdownContentProps {
  content: string;
}

function MarkdownAnchor({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  if (!href) return <>{children}</>;

  const label = String(children ?? "");
  const compact =
    label === href ||
    label.startsWith("http://") ||
    label.startsWith("https://") ||
    label === hostnameFromUrl(href);

  if (compact) {
    const host = hostnameFromUrl(href);
    return (
      <Tooltip label={href} multiline maw={320} withArrow>
        <span className="favicon-link-wrap">
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            aria-label={host}
            className="favicon-link"
          >
            <FaviconImg url={href} alt={host} size={14} />
          </a>
        </span>
      </Tooltip>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="markdown-body" data-color-mode="dark" data-dark-theme="dark">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkSolid]}
        rehypePlugins={[[rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }]]}
        components={{
          a: ({ href, children }) => (
            <MarkdownAnchor href={href}>{children}</MarkdownAnchor>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
