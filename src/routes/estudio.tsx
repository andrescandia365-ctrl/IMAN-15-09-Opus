import { createFileRoute } from "@tanstack/react-router";
import { EstudioScreen } from "@/components/estudio-screen";

export const Route = createFileRoute("/estudio")({ component: EstudioScreen });
