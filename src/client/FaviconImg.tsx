import { useState, type CSSProperties } from "react";

import { DEFAULT_FAVICON_URL, faviconUrl, isDefaultFaviconSrc } from "../shared";

interface FaviconImgProps {
  url: string;
  size?: number;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}

export default function FaviconImg({
  url,
  size = 16,
  alt = "",
  className,
  style,
}: FaviconImgProps) {
  const [useDefaultIcon, setUseDefaultIcon] = useState(false);

  const shellSize = size + 4;

  return (
    <span
      className={["favicon-inline", className].filter(Boolean).join(" ")}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.94)",
        borderRadius: 3,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: shellSize,
        height: shellSize,
        flexShrink: 0,
        lineHeight: 0,
        verticalAlign: "middle",
        ...style,
      }}
    >
      <img
        className="favicon-inline-img"
        src={faviconUrl(url)}
        alt={alt}
        width={size}
        height={size}
        style={{
          display: "block",
          width: size,
          height: size,
          objectFit: "contain",
          filter: useDefaultIcon ? undefined : "invert(1) hue-rotate(180deg)",
        }}
        onLoad={(event) => {
          setUseDefaultIcon(isDefaultFaviconSrc(event.currentTarget.src));
        }}
        onError={(event) => {
          const img = event.currentTarget;
          if (isDefaultFaviconSrc(img.src)) return;
          img.src = DEFAULT_FAVICON_URL;
          setUseDefaultIcon(true);
        }}
      />
    </span>
  );
}
