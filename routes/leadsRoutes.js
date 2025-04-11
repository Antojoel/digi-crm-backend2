const express = require("express");
const { body, param, query } = require("express-validator");
const {
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
} = require("../controllers/leadsController");
const { authenticate } = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");

const router = express.Router();

// All lead routes require authentication
router.use(authenticate);

// Get all leads
router.get(
  "/",
  [
    query("stage")
      .optional()
      .isIn([
        "new",
        "contacted",
        "analysis",
        "proposal",
        "negotiation",
        "won",
        "hold",
        "progress",
        "completed",
        "lost",
      ])
      .withMessage("Invalid stage"),
  ],
  checkPermission("leads", "read"),
  getAllLeads
);

// Get lead by ID
router.get(
  "/:id",
  [param("id").isInt().withMessage("Lead ID must be an integer")],
  checkPermission("leads", "read"),
  getLeadById
);

// Create lead
router.post(
  "/",
  [
    body("dealName").notEmpty().withMessage("Deal name is required"),
    body("amount").isNumeric().withMessage("Amount must be a number"),
    body("product").notEmpty().withMessage("Product is required"),
    body("stage")
      .optional()
      .isIn([
        "new",
        "contacted",
        "analysis",
        "proposal",
        "negotiation",
        "won",
        "hold",
        "progress",
        "completed",
        "lost",
      ])
      .withMessage("Invalid stage"),
    body("date")
      .isISO8601()
      .withMessage("Date must be in ISO format (YYYY-MM-DD)"),
    body("customerId").isInt().withMessage("Customer ID must be an integer"),
    body("attainedThrough").optional(),
  ],
  checkPermission("leads", "create"),
  createLead
);

// Update lead
router.put(
  "/:id",
  [
    param("id").isInt().withMessage("Lead ID must be an integer"),
    body("dealName").optional(),
    body("amount")
      .optional()
      .isNumeric()
      .withMessage("Amount must be a number"),
    body("product").optional(),
    body("stage")
      .optional()
      .isIn([
        "new",
        "contacted",
        "analysis",
        "proposal",
        "negotiation",
        "won",
        "hold",
        "progress",
        "completed",
        "lost",
      ])
      .withMessage("Invalid stage"),
    body("date")
      .optional()
      .isISO8601()
      .withMessage("Date must be in ISO format (YYYY-MM-DD)"),
    body("customerId")
      .optional()
      .isInt()
      .withMessage("Customer ID must be an integer"),
  ],
  checkPermission("leads", "update"),
  updateLead
);

// Delete lead
router.delete(
  "/:id",
  [param("id").isInt().withMessage("Lead ID must be an integer")],
  checkPermission("leads", "delete"),
  deleteLead
);

module.exports = router;
