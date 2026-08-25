const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Cloud Function to handle server-side Flutterwave webhook payment verification.
 */
exports.verifyFlutterwavePayment = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send({ message: "Method not allowed" });
  }

  const { tx_ref, transaction_id, status } = req.body;

  if (status === "successful" || status === "completed") {
    try {
      const orderRef = admin.firestore().collection("orders").doc(tx_ref);
      const orderDoc = await orderRef.get();

      if (orderDoc.exists && orderDoc.data().status !== "PAID") {
        const orderData = orderDoc.data();

        // 1. Mark order paid
        await orderRef.update({
          status: "PAID",
          transactionId: transaction_id,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // 2. Grant purchase to student
        const purchaseRef = admin.firestore().collection("purchases").doc();
        await purchaseRef.set({
          id: purchaseRef.id,
          studentUid: orderData.studentUid,
          bookId: orderData.bookId,
          bookTitle: orderData.bookTitle,
          authorUid: orderData.authorUid,
          price: orderData.amount,
          transactionRef: tx_ref,
          purchaseDate: new Date().toISOString(),
        });

        // 3. Update book sales count
        await admin.firestore().collection("books").doc(orderData.bookId).update({
          salesCount: admin.firestore.FieldValue.increment(1)
        });

        // 4. Update author earnings
        if (orderData.authorUid) {
          const lecturerEarnings = orderData.amount * 0.70; // 70% share
          const userRef = admin.firestore().collection("users").doc(orderData.authorUid);
          await userRef.update({
            earningsBalance: admin.firestore.FieldValue.increment(lecturerEarnings)
          });
        }

        // 5. Update affiliate balance if referred
        if (orderData.affiliateCode) {
          const affiliateCommission = orderData.amount * 0.10; // 10% share
          const affSnap = await admin.firestore()
            .collection("users")
            .where("affiliateCode", "==", orderData.affiliateCode)
            .get();

          if (!affSnap.empty) {
            const affDoc = affSnap.docs[0];
            await affDoc.ref.update({
              commissionBalance: admin.firestore.FieldValue.increment(affiliateCommission)
            });
          }
        }
      }

      return res.status(200).send({ status: "success", message: "Payment verified and purchase granted" });
    } catch (err) {
      console.error("Payment Verification Error:", err);
      return res.status(500).send({ status: "error", message: err.message });
    }
  }

  return res.status(400).send({ status: "failed", message: "Transaction status not successful" });
});
