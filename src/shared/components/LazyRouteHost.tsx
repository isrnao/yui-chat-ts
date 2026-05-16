import {
  Suspense,
  lazy,
  useCallback,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import RouteErrorBoundary from './RouteErrorBoundary';

type AnyProps = Record<string, unknown>;

type Props<P extends AnyProps> = {
  factory: () => Promise<{ default: ComponentType<P> }>;
  componentProps?: P;
  fallback?: ReactNode;
};

const defaultFallback = <div className="p-4 text-sm text-gray-500">読み込み中…</div>;

export default function LazyRouteHost<P extends AnyProps>({
  factory,
  componentProps,
  fallback = defaultFallback,
}: Props<P>) {
  const [Component, setComponent] = useState<LazyExoticComponent<ComponentType<P>>>(() =>
    lazy(factory)
  );
  const handleRetry = useCallback(() => {
    setComponent(lazy(factory));
  }, [factory]);

  return (
    <RouteErrorBoundary onRetry={handleRetry}>
      <Suspense fallback={fallback}>
        <Component {...((componentProps ?? {}) as P)} />
      </Suspense>
    </RouteErrorBoundary>
  );
}
