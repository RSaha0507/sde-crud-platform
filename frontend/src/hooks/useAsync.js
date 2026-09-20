import { useCallback, useEffect, useState } from "react";

export function useAsync(task, dependencies = []) {
  const [state, setState] = useState({
    data: null,
    loading: true,
    error: null,
  });
  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await task();
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      setState({ data: null, loading: false, error });
      return null;
    }
    // The caller controls when the async task identity changes through dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, retry: run };
}
