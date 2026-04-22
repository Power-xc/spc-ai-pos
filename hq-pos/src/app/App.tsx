import { RouterProvider } from "react-router";
import { router } from "./routes";
import { NudgeProvider } from "./components/NudgeContext";

export default function App() {
  return (
    <NudgeProvider>
      <RouterProvider router={router} />
    </NudgeProvider>
  );
}
