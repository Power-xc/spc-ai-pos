export type TodoActionType = "complete" | "hold";

export type TodoUpdatedDetail = {
  todoId: string;
  action: TodoActionType;
  updatedAt: string;
};

const TODO_UPDATED_EVENT = "fox:todo-updated";

export function emitTodoUpdated(detail: TodoUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<TodoUpdatedDetail>(TODO_UPDATED_EVENT, { detail }));
}

export function subscribeTodoUpdated(handler: (detail: TodoUpdatedDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: Event) => {
    const custom = event as CustomEvent<TodoUpdatedDetail>;
    if (custom.detail) {
      handler(custom.detail);
    }
  };
  window.addEventListener(TODO_UPDATED_EVENT, listener as EventListener);
  return () => window.removeEventListener(TODO_UPDATED_EVENT, listener as EventListener);
}
