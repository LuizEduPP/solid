import { Box, type BoxProps } from "@mantine/core";
import type { ReactNode } from "react";

export const CHAT_MAX_WIDTH = 720;

export default function ChatColumn({ children, ...props }: BoxProps & { children: ReactNode }) {
  return (
    <Box maw={CHAT_MAX_WIDTH} mx="auto" px="lg" w="100%" {...props}>
      {children}
    </Box>
  );
}
