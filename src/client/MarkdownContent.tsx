import { Anchor, Box, Tooltip } from "@mantine/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "github-markdown-css/github-markdown-dark.css";

import { faviconUrl, hostnameFromUrl } from "../shared/domains";

interface MarkdownContentProps {
  content: string;
}

function linkifyBracketUrls(text: string): string {
  return text.replace(
    /\[(https?:\/\/[^\]\s,]+(?:,\s*https?:\/\/[^\]\s,]+)*)\]/g,
    (_, urls: string) =>
      urls
        .split(/,\s*/)
        .map((raw) => {
          const url = raw.trim();
          return `[${hostnameFromUrl(url)}](${url})`;
        })
        .join(" "),
  );
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
        <Anchor
          href={href}
          target="_blank"
          rel="noreferrer"
          underline="never"
          inline
          mx={2}
          style={{ verticalAlign: "middle" }}
        >
          <Box
            component="img"
            src={faviconUrl(href)}
            alt={host}
            w={16}
            h={16}
            style={{ borderRadius: 3, display: "inline-block", verticalAlign: "middle" }}
          />
        </Anchor>
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
  const prepared = linkifyBracketUrls(content);

  return (
    <div className="markdown-body" data-color-mode="dark" data-dark-theme="dark">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <MarkdownAnchor href={href}>{children}</MarkdownAnchor>
          ),
        }}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}
