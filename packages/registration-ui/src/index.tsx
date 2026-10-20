export interface IcpRegistrationProps {
  number: string;
  className?: string;
}

export function IcpRegistration({ number, className }: IcpRegistrationProps) {
  return <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className={className}>{number}</a>;
}

export interface PublicSecurityRegistrationProps extends IcpRegistrationProps {
  /** Numeric registration code used by the official query service. */
  code: string;
  /** URL supplied by the host bundler from registration-ui/beian-badge.png. */
  badgeSrc: string;
  badgeSize?: number;
}

export function PublicSecurityRegistration({ number, code, badgeSrc, badgeSize = 14, className }: PublicSecurityRegistrationProps) {
  return (
    <a href={`https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(code)}`} target="_blank" rel="noopener noreferrer" className={className}>
      <img src={badgeSrc} alt="" width={badgeSize} height={badgeSize} style={{ flexShrink: 0 }} />
      {number}
    </a>
  );
}
