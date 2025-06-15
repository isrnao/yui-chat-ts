declare module '*.mdx' {
  import * as React from 'react';
  const MDXComponent: () => React.ReactElement;
  export default MDXComponent;
}
