import { onBeforeUnmount, ref, watch } from "vue";

/**
 * Keeps a copy of a wide table's header row stuck to the page while the table
 * scrolls sideways in its own box.
 *
 * A box that scrolls sideways is also what sticky cells measure against, so the
 * table's own header can't stick to the page. Instead a copy sits outside the box
 * as a sticky element, with its columns sized from the real header and its
 * sideways scroll kept in step with the box. The real header stays in the table,
 * hidden, so the table keeps its layout.
 *
 * @param {Object} elements
 * @param {import("vue").Ref<HTMLElement | null>} elements.head The sticky element holding the copy
 * @param {import("vue").Ref<HTMLTableElement | null>} elements.headTable The copy's table
 * @param {import("vue").Ref<HTMLElement | null>} elements.box The box the table scrolls sideways in
 * @param {import("vue").Ref<HTMLTableElement | null>} elements.table The real table
 * @returns {{ headHeight: import("vue").Ref<number>, sizeColumns: () => void }} headHeight is the
 *   copy's height, to pull the box up under it; call sizeColumns when the columns change
 */
export const useStickyTableHeader = ({ head, headTable, box, table }) => {
  const headHeight = ref(0);

  const sizeColumns = () => {
    const realCells = table.value?.tHead?.rows[0]?.cells;
    const copyCells = headTable.value?.tHead?.rows[0]?.cells;
    if (!realCells || !copyCells || !table.value || !headTable.value) return;
    headTable.value.style.width = `${table.value.getBoundingClientRect().width}px`;
    for (let index = 0; index < copyCells.length; index++) {
      const width = `${realCells[index]?.getBoundingClientRect().width ?? 0}px`;
      copyCells[index].style.width = width;
      copyCells[index].style.minWidth = width;
      copyCells[index].style.maxWidth = width;
    }
    headHeight.value = head.value?.offsetHeight ?? 0;
    if (head.value && box.value) head.value.scrollLeft = box.value.scrollLeft;
  };

  // either side can be scrolled: the box by its scrollbar, the copy by a sideways swipe on it
  const followBox = () => {
    if (head.value && box.value && head.value.scrollLeft !== box.value.scrollLeft) {
      head.value.scrollLeft = box.value.scrollLeft;
    }
  };
  const followHead = () => {
    if (head.value && box.value && box.value.scrollLeft !== head.value.scrollLeft) {
      box.value.scrollLeft = head.value.scrollLeft;
    }
  };

  // the timetable comes and goes as filters change, so attach to whichever elements are there
  const resizeObserver = new ResizeObserver(sizeColumns);
  watch(
    [head, headTable, box, table],
    ([headEl, headTableEl, boxEl, tableEl], _previous, onCleanup) => {
      if (!headEl || !headTableEl || !boxEl || !tableEl) return;
      resizeObserver.observe(tableEl);
      boxEl.addEventListener("scroll", followBox, { passive: true });
      headEl.addEventListener("scroll", followHead, { passive: true });
      sizeColumns();
      onCleanup(() => {
        resizeObserver.unobserve(tableEl);
        boxEl.removeEventListener("scroll", followBox);
        headEl.removeEventListener("scroll", followHead);
      });
    },
    { immediate: true, flush: "post" },
  );
  onBeforeUnmount(() => resizeObserver.disconnect());

  return { headHeight, sizeColumns };
};
