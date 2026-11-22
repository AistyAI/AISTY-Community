// The shell's icon set: one grid (24), one stroke (1.5), round caps and joins, no fills.
import React from "react";

const Icon = ({ size = 18, children, ...props }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
);

export const HomeIcon = (p) => <Icon {...p}><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M9.5 20v-5.5h5V20" /></Icon>;
export const ChatBubbleIcon = (p) => <Icon {...p}><path d="M5 5h14v10H9l-4 4z" /></Icon>;
export const HistoryIcon = (p) => <Icon {...p}><path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" /><path d="M4 4v4.5h4.5" /><path d="M12 8v4.5l3 1.5" /></Icon>;
export const PeopleIcon = (p) => <Icon {...p}><circle cx="9" cy="8.5" r="3.25" /><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.6a3.25 3.25 0 0 1 0 5.8M17.5 14.4a5.5 5.5 0 0 1 3 5.1" /></Icon>;
export const BoardIcon = (p) => <Icon {...p}><rect x="3.75" y="4.5" width="16.5" height="15" rx="1.5" /><path d="M9.25 4.5v15M14.75 4.5v15" /></Icon>;
export const FolderIcon = (p) => <Icon {...p}><path d="M3.75 6.75A1.5 1.5 0 0 1 5.25 5.25h4l2 2h7.5a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5z" /></Icon>;
export const PlanIcon = (p) => <Icon {...p}><path d="M12 3.75 19.5 7.5v9L12 20.25 4.5 16.5v-9z" /><path d="M4.5 7.5 12 11.25l7.5-3.75M12 11.25v9" /></Icon>;
export const SettingsIcon = (p) => <Icon {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>;
export const AuditIcon = (p) => <Icon {...p}><path d="M7 3.75h7.5L18 7.25v13H7z" /><path d="M14.25 3.75v3.75H18M10 12h5M10 15.5h5" /></Icon>;
export const HelpIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="8.25" /><path d="M9.75 9.75a2.25 2.25 0 1 1 3.1 2.08c-.5.2-.85.7-.85 1.25V14" /><path d="M12 16.75h.01" /></Icon>;
export const BookIcon = (p) => <Icon {...p}><path d="M5 5.25A1.5 1.5 0 0 1 6.5 3.75H19v14.5H6.5A1.5 1.5 0 0 0 5 19.75z" /><path d="M5 19.75a1.5 1.5 0 0 0 1.5 1.5H19" /></Icon>;
export const LogoutIcon = (p) => <Icon {...p}><path d="M10 4.5H5.5v15H10" /><path d="M14 8l4 4-4 4M18 12H9.5" /></Icon>;
export const LockIcon = (p) => <Icon {...p}><rect x="5.25" y="10.5" width="13.5" height="9.75" rx="1.5" /><path d="M8.25 10.5V8a3.75 3.75 0 0 1 7.5 0v2.5" /></Icon>;
export const ArrowUpRightIcon = (p) => <Icon {...p}><path d="M7.5 16.5 16.5 7.5M9 7.5h7.5V15" /></Icon>;
export const CalendarIcon = (p) => <Icon {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Icon>;
export const ModelIcon = (p) => <Icon {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /><path d="M10 10h4v4h-4zM10 3.5v3M14 3.5v3M10 17.5v3M14 17.5v3M3.5 10h3M3.5 14h3M17.5 10h3M17.5 14h3" /></Icon>;
export const ShieldIcon = (p) => <Icon {...p}><path d="M12 3.75 18.75 6v5.5c0 4.2-2.9 7.3-6.75 8.75-3.85-1.45-6.75-4.55-6.75-8.75V6z" /><path d="m9.25 12 2 2 3.5-4" /></Icon>;
export const CheckIcon = (p) => <Icon {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="6.25" /><path d="m20 20-4.5-4.5" /></Icon>;
export const BackIcon = (p) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
export const BinIcon = (p) => <Icon {...p}><path d="M4.5 7h15M9.5 7V4.75h5V7M6.5 7l.75 12.5h9.5L17.5 7" /></Icon>;
export const CloseIcon = (p) => <Icon {...p}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
export const BillingIcon = PlanIcon;
export const ProfileIcon = PeopleIcon;
export const LinkIcon = (p) => <Icon {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4.2l2.6-2.6a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" /><path d="M14 10a4.5 4.5 0 0 0-6.4-.2L5 12.4a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" /></Icon>;
export const ExitIcon = CloseIcon;
export const EyeIcon = (p) => <Icon {...p}><path d="M2.75 12S6 5.75 12 5.75 21.25 12 21.25 12 18 18.25 12 18.25 2.75 12 2.75 12z" /><circle cx="12" cy="12" r="2.75" /></Icon>;
export const PlugIcon = (p) => <Icon {...p}><path d="M9 3.75v4.5M15 3.75v4.5M7 8.25h10v3.5a5 5 0 0 1-10 0z" /><path d="M12 16.75v3.5" /></Icon>;
export const ScaleIcon = (p) => <Icon {...p}><path d="M12 4v16M7 20h10M5.5 7.5h13" /><path d="m5.5 7.5-2.5 6a2.75 2.75 0 0 0 5 0zM18.5 7.5l-2.5 6a2.75 2.75 0 0 0 5 0z" /></Icon>;
