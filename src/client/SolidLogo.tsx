import { Group, Text, type GroupProps } from "@mantine/core";

interface SolidLogoProps extends GroupProps {
  size?: number;
  showWordmark?: boolean;
  wordmarkSize?: "sm" | "md" | "lg";
}

export default function SolidLogo({
  size = 28,
  showWordmark = true,
  wordmarkSize = "md",
  gap = "xs",
  ...props
}: SolidLogoProps) {
  return (
    <Group gap={gap} wrap="nowrap" {...props}>
      <img
        src="/solid-logo.png"
        alt=""
        width={size}
        height={size}
        style={{ display: "block", flexShrink: 0 }}
      />
      {showWordmark ? (
        <Text
          component="span"
          fw={600}
          lh={1}
          style={{
            letterSpacing: "-0.02em",
            fontSize:
              wordmarkSize === "lg"
                ? "var(--mantine-h1-font-size)"
                : wordmarkSize === "md"
                  ? "var(--mantine-h4-font-size)"
                  : "var(--mantine-font-size-sm)",
          }}
        >
          solid
        </Text>
      ) : null}
    </Group>
  );
}
