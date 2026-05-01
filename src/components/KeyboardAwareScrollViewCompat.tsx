import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

/**
 * On web/Capacitor, the browser/webview handles keyboard adjustments.
 * This component provides a scrollable container that mimics the intent
 * of KeyboardAwareScrollView for the web environment.
 */
export function KeyboardAwareScrollViewCompat({
  children,
  style,
  className = "",
}: Props) {
  return (
    <div
      className={`no-scrollbar ${className}`}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
