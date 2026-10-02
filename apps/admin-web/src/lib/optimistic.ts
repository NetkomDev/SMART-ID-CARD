/**
 * Generic optimistic mutation helper.
 * Applies DOM changes instantly, fires API call in background,
 * and rolls back if the API call fails.
 */

import { toast } from "./toast";
import { ApiClientError } from "./api";

export interface OptimisticOptions<T = unknown> {
  /** Immediately apply changes to the DOM */
  apply: () => void;
  /** The actual API call */
  mutation: () => Promise<T>;
  /** Revert DOM if API fails */
  rollback: () => void;
  /** Optional: silent revalidation after success (e.g. re-fetch fresh data) */
  revalidate?: () => Promise<void> | void;
  /** Toast message on success (falsy = no toast) */
  successMessage?: string;
  /** Error message prefix */
  errorPrefix?: string;
}

export async function optimistic<T = unknown>(
  options: OptimisticOptions<T>
): Promise<T | null> {
  const {
    apply,
    mutation,
    rollback,
    revalidate,
    successMessage,
    errorPrefix = "Gagal menyimpan",
  } = options;

  // Step 1: Instantly apply the optimistic update
  try {
    apply();
  } catch (err) {
    console.error("[optimistic] apply() threw:", err);
  }

  // Step 2: Fire the real API call in background
  try {
    const result = await mutation();

    // Step 3a: Success → optional success toast
    if (successMessage) {
      toast(successMessage, "success");
    }

    // Step 3b: Silent revalidation
    try {
      await revalidate?.();
    } catch {
      // Revalidation failure is non-critical
    }

    return result;
  } catch (error) {
    // Step 4: Failure → rollback + error toast
    try {
      rollback();
    } catch (rollbackError) {
      console.error("[optimistic] rollback() threw:", rollbackError);
    }

    const message =
      error instanceof ApiClientError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Terjadi kesalahan yang tidak diketahui.";

    toast(`${errorPrefix}: ${message}`, "error");
    return null;
  }
}

/**
 * Helper to fade-out and remove a table row with animation.
 * Returns a cleanup function to re-insert the row at its original position.
 */
export function removeRowOptimistic(row: HTMLTableRowElement): () => void {
  const parent = row.parentElement;
  const nextSibling = row.nextElementSibling;
  const originalDisplay = row.style.display;
  const originalOpacity = row.style.opacity;
  const originalTransition = row.style.transition;
  const originalMaxHeight = row.style.maxHeight;
  const originalOverflow = row.style.overflow;

  // Animate out
  row.style.transition = "opacity 0.25s ease, max-height 0.3s ease 0.1s";
  row.style.overflow = "hidden";
  row.style.maxHeight = row.offsetHeight + "px";
  requestAnimationFrame(() => {
    row.style.opacity = "0";
    row.style.maxHeight = "0";
  });

  // Remove after animation
  const removeTimer = setTimeout(() => row.remove(), 350);

  // Return rollback function
  return () => {
    clearTimeout(removeTimer);
    row.style.transition = originalTransition;
    row.style.opacity = originalOpacity;
    row.style.maxHeight = originalMaxHeight;
    row.style.overflow = originalOverflow;
    row.style.display = originalDisplay;
    if (parent) {
      if (nextSibling) {
        parent.insertBefore(row, nextSibling);
      } else {
        parent.appendChild(row);
      }
    }
  };
}

/**
 * Helper to toggle a status badge/button optimistically.
 * Returns a rollback function.
 */
export function toggleStatusOptimistic(
  el: HTMLElement,
  newText: string,
  newClass: string,
  oldText: string,
  oldClass: string
): () => void {
  el.textContent = newText;
  el.classList.remove(oldClass);
  el.classList.add(newClass);

  return () => {
    el.textContent = oldText;
    el.classList.remove(newClass);
    el.classList.add(oldClass);
  };
}
