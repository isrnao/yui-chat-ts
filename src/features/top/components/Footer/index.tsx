import { Fragment } from 'react';
import { footerLines } from '../../data';

export function Footer() {
  return (
    <footer className="bg-blue-700 text-white">
      <div className="mx-auto max-w-[990px] px-1 py-5 text-[12px] leading-7">
        <p>
          {footerLines.map((line, index) => (
            <Fragment key={line}>
              {index > 0 && <br />}
              {line}
            </Fragment>
          ))}
        </p>
      </div>
    </footer>
  );
}
