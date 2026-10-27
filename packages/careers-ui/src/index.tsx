"use client";

import { Fragment, useId, useState, type ReactNode } from "react";

export type CareerItem = { id: string; title: string; category: string; searchText: string; meta?: ReactNode };
export type CareerLabels = { filters: string; search: string; placeholder: string; categories: string; results: string; empty: string; clearFilters: string };
export type CareerClasses = { browser?: string; filters?: string; heading?: string; searchWrap?: string; search?: string; categories?: string; filterRow?: string; results?: string; empty?: string };

export function CareersBrowser({ positions, labels, classes = {}, renderPosition, renderClear, filterExtra, resultsHeading = "h2" }: {
  positions: readonly CareerItem[]; labels: CareerLabels; classes?: CareerClasses;
  renderPosition: (position: CareerItem) => ReactNode;
  renderClear?: (clear: () => void) => ReactNode;
  filterExtra?: ReactNode; resultsHeading?: "h1" | "h2";
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const searchId = useId();
  const resultsId = useId();
  const categories = [...new Set(positions.map(position => position.category))];
  const visible = positions.filter(position => (!selected.length || selected.includes(position.category)) && `${position.title} ${position.category} ${position.searchText}`.toLowerCase().includes(query.trim().toLowerCase()));
  const Heading = resultsHeading;
  return <div className={classes.browser}>
    <aside className={classes.filters} aria-label={labels.filters}>
      <label className={classes.heading} htmlFor={searchId}>{labels.search}</label>
      <div className={classes.searchWrap}><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={labels.placeholder} className={classes.search} />{query && renderClear?.(() => setQuery(""))}</div>
      <fieldset className={classes.categories}><legend className={classes.heading}>{labels.categories}</legend>
        {categories.map(category => <label key={category} className={classes.filterRow}><input type="checkbox" checked={selected.includes(category)} onChange={event => { const checked = event.currentTarget.checked; setSelected(current => checked ? [...current, category] : current.filter(value => value !== category)); }} /><span>{category}</span></label>)}
      </fieldset>{filterExtra}
    </aside>
    <section className={classes.results} aria-labelledby={resultsId}><Heading id={resultsId} className={classes.heading}>{labels.results}</Heading>
      <div aria-live="polite">{visible.map(position => <Fragment key={position.id}>{renderPosition(position)}</Fragment>)}
        {!visible.length && <p className={classes.empty}>{labels.empty} <button type="button" onClick={() => { setQuery(""); setSelected([]); }}>{labels.clearFilters}</button></p>}
      </div>
    </section>
  </div>;
}

export type CareerSection = { title: string; paragraphs?: readonly string[]; items?: readonly string[] };
export function CareerDetail({ title, meta, introduction, sections, paragraphClassName }: { title: string; meta?: ReactNode; introduction?: ReactNode; sections: readonly CareerSection[]; paragraphClassName?: string }) {
  return <><h1>{title}</h1>{meta}{introduction}{sections.filter(section => section.paragraphs?.length || section.items?.length).map(section => <section key={section.title}><h2>{section.title}</h2>{section.paragraphs?.map((paragraph, index) => <p className={paragraphClassName} key={index}>{paragraph}</p>)}{Boolean(section.items?.length) && <ul>{section.items?.map((item, index) => <li key={index}>{item}</li>)}</ul>}</section>)}</>;
}
