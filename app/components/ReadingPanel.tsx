type Props = {
  item: any;
};

export function ReadingPanel({ item }: Props) {
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
        {(item?.body || ['Select a result and open reading mode.']).map(
          (paragraph: string) => (
            <p key={paragraph}>{paragraph}</p>
          )
        )}
      </div>
    </section>
  );
}
