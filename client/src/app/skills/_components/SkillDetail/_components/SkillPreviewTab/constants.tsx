import type { Components } from "react-markdown";
import { md } from "./styles";

/** Styled elements for the rendered skill body (links are inert text-only styling; no raw HTML is rendered). */
export const MD_COMPONENTS: Components = {
  h1: ({ children }) => <h4 style={md.h1}>{children}</h4>,
  h2: ({ children }) => <h5 style={md.h2}>{children}</h5>,
  h3: ({ children }) => <h6 style={md.h3}>{children}</h6>,
  p: ({ children }) => <p style={md.p}>{children}</p>,
  ul: ({ children }) => <ul style={md.ul}>{children}</ul>,
  ol: ({ children }) => <ol style={md.ul}>{children}</ol>,
  li: ({ children }) => <li style={md.li}>{children}</li>,
  strong: ({ children }) => <strong style={md.strong}>{children}</strong>,
  code: ({ children }) => (
    <code className="mono" style={md.code}>
      {children}
    </code>
  ),
  pre: ({ children }) => <pre style={md.pre}>{children}</pre>,
  a: ({ children, href }) => (
    <a href={href} rel="noopener noreferrer nofollow" target="_blank" style={md.a}>
      {children}
    </a>
  ),
};
