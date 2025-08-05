import { Layout, Navbar } from "nextra-theme-docs";
import { getPageMap } from "nextra/page-map";
import { Footer } from "@/components/Footer";
import { ModeToggle } from "@/components/ModeToggle";

export const metadata = {
  // Define your metadata here
  // For more information on metadata API, see: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
};

const navbar = (
  <Navbar logo={<b>DummyDB</b>}>
    <ModeToggle />
  </Navbar>
);
const footer = <Footer></Footer>;
const feedback = {
  // content: null,
  labels: "feedback",
  // ... Your additional feedback options
  // For more information on feedback API, see: https://nextra.vercel.app/docs/feedback
};
const sidebar = {
  toggleButton: false,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Layout
        navbar={navbar}
        pageMap={await getPageMap()}
        docsRepositoryBase="https://github.com/ghoshsoham71/DummyDB/tree/main/ui"
        footer={footer}
        // editLink={null}
        feedback={feedback}
        darkMode={false}
        sidebar={sidebar}

        // ... Your additional layout options
      >
        {children}
      </Layout>
    </>
  );
}
