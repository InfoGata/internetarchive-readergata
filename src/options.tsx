import { render } from "preact";
import App from "./App";
import { ThemeProvider } from "@infogata/shadcn-vite-theme-provider";

export const init = () => {
  render(<ThemeProvider><App /></ThemeProvider>, document.body);
};
