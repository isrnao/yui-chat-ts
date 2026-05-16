import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  onRetry?: () => void;
};

type State = { error: Error | null };

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message ?? '';
  const name = error.name ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (isChunkLoadError(error)) {
      return (
        <div className="mx-auto max-w-md p-6 text-sm text-gray-700">
          <p className="mb-3">読み込みに失敗しました。電波の良いところで再試行してください。</p>
          <button
            type="button"
            className="rounded border border-blue-500 bg-blue-50 px-3 py-1 text-blue-700"
            onClick={this.handleRetry}
          >
            再試行
          </button>
        </div>
      );
    }

    return (
      <div className="mx-auto max-w-md p-6 text-sm text-gray-700">
        <p className="mb-3">予期しないエラーが発生しました。</p>
        <a className="text-blue-600 underline" href={import.meta.env.BASE_URL}>
          トップへ戻る
        </a>
      </div>
    );
  }
}
