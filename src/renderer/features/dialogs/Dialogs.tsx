import React from "react";

import { TGlobalState } from "../../core/state/state";
import { IDialogViewData, Views } from "../../core/state/view";
import { uuid } from "../../core/utils/node-utils";

export const dialogsState = new TGlobalState<IDialogViewData[]>([]);

export function Dialogs() {
	const dialogs = dialogsState.use();

	if (!dialogs.length) {
		return null;
	}

	return (
		<>
			{dialogs.map((dialogView) => (
				<React.Fragment key={dialogView.internalId}>
					{Views.renderView(dialogView.viewId, {
						model: dialogView.model,
						className: "dialog",
					})}
				</React.Fragment>
			))}
		</>
	);
}

export async function showDialog<R>(data: IDialogViewData): Promise<R> {
	data.internalId = uuid();
	data.model.result = new Promise<R>(resolve => {
		data.model.onClose = res => {
			dialogsState.set(oldState => oldState.filter(item => item !== data));
			resolve(res);
		};
		dialogsState.set(oldState => [...oldState, data]);
	});

	return data.model.result;
}

export const closeDialog = (viewId: symbol) => {
	const state = dialogsState.get();
	const currentDialog = state.find(s => s.viewId === viewId);
	if (currentDialog) {
		currentDialog?.model.close(currentDialog);
	}
};
