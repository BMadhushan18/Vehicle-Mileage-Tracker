import { Suspense, lazy, type ComponentProps } from 'react';
import { Skeleton } from '../components/ui';

const ChartView = lazy(() => import('./Charts'));

export type ChartProps = ComponentProps<typeof ChartView>;

export function LazyChart(props: ChartProps) {
  return (
    <Suspense fallback={<Skeleton height={props.height ?? 220} />}>
      <ChartView {...props} />
    </Suspense>
  );
}
