// Jest stand-ins for the chat's ESM-only markdown and highlighting packages.
import React from "react";

const Markdown = ({ children }) => <div>{children}</div>;
export default Markdown;
export const Prism = ({ children }) => <pre>{children}</pre>;
export const oneLight = {};
