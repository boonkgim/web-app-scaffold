import { CheckoutForm } from "./checkout-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// max-w-xl, wider than the home card's max-w-md: the embedded form is Stripe's layout
// and it crowds itself below about 28rem. The card is here for the page to have edges,
// not to constrain the iframe.
export default function CheckoutPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>web-app-scaffold test item</CardTitle>
        </CardHeader>
        <CardContent>
          <CheckoutForm />
        </CardContent>
      </Card>
    </main>
  );
}
