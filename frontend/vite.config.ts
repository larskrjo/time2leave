import {reactRouter} from "@react-router/dev/vite";
import {defineConfig} from "vite";
import tsconfigPaths from "vite-tsconfig-paths";


export default defineConfig({
    plugins: [reactRouter(), tsconfigPaths()],
    server: {
        host: true,
        allowedHosts: [
            "localhost",
            "127.0.0.1",
            "time2leave.com",
            "www.time2leave.com",
            "traffic.larsjohansen.com",
        ],
    },
});
