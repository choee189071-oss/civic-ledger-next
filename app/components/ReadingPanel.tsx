import { FormattedReport } from './FormattedReport';

type Props = {
  item: any;
};

export function ReadingPanel({ item }: Props) {
  const content = (item?.body || ['Select a result and open reading mode.']).join('\n\n');

  return (
    <section className="full-page-panel reading-desk">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Reading</p>
          <h2>{item?.title || 'Reading room'}</h2>
        </div>
        <span className="status-pill">Draft</span>
      </div>
      <div className="reading-body">
        <FormattedReport content={content} />
      </div>
    </section>
  );
}
