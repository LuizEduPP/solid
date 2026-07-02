import { useState } from "react";
import { Box, type BoxProps } from "@mantine/core";

import { DEFAULT_FAVICON_URL, faviconUrl } from "../shared";

interface FaviconImgProps extends Omit<BoxProps, "component" | "children"> {
  url: string;
  size?: number;
  alt?: string;
}

function isDefaultFaviconSrc(src: string): boolean {
  return src.includes("/favicons/default");
}

export default function FaviconImg({
  url,
  size = 16,
  alt = "",
  style,
  ...props
}: FaviconImgProps) {
  const [useDefaultIcon, setUseDefaultIcon] = useState(false);

  const shellSize = size + 4;

  return (
    <Box
      w={shellSize}
      h={shellSize}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.94)",
        borderRadius: 3,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 0,
        verticalAlign: "middle",
        ...style,
      }}
      {...props}
    >
      <Box
        component="img"
        src={faviconUrl(url)}
        alt={alt}
        w={size}
        h={size}
        style={{
          display: "block",
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
    </Box>
  );
}
